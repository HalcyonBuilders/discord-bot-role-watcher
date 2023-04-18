require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('guildCreate', async (guild) => {
  console.log(`Joined new server: ${guild.name} (id: ${guild.id})`);

  try {
    // Fetch all members of the guild
    await guild.members.fetch();

    for (const [memberId, member] of guild.members.cache) {
      console.log(member.user.username);
      for (const [roleId, role] of member.roles.cache) {
        if (role.name !== '@everyone' && role.name !== 'role_watcher') {
          console.log('role', role.name);
          await addRoleToDatabase(role, memberId);
        }
      }
    }
  } catch (error) {
    console.error(`Error fetching guild members for guild ${guild.id}:`, error);
  }
});

const addRoleToDatabase = async (role, userId) => {
  const enthusiast = isEnthusiastRole(role.name);

  // Check if the role already exists for this usedId
  const { data: existingRole } = await supabase
    .from('role_updates')
    .select('id')
    .eq('role', role.name)
    .eq('user_id', userId)
    .single();

  if (existingRole) {
    // If the role exists, update the row with the new timestamp
    await supabase
      .from('role_updates')
      .update({
        timestamp: new Date().toISOString(),
      })
      .eq('id', existingRole.id);
  } else {
    // If the role does not exist, insert a new row
    await supabase
      .from('role_updates')
      .insert([
        {
          user_id: userId,
          role: role.name,
          enthusiast,
          timestamp: new Date().toISOString(),
        },
      ])
      .single();
  }
};

const isEnthusiastRole = (roleName) => {
  return roleName.endsWith(' Enthusiast');
};

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const addedRoles = newMember.roles.cache.filter(
    (role) => !oldMember.roles.cache.has(role.id)
  );
  const removedRoles = oldMember.roles.cache.filter(
    (role) => !newMember.roles.cache.has(role.id)
  );

  for (const addedRole of addedRoles.values()) {
    addRoleToDatabase(addedRole, newMember.id);
  }

  for (const removedRole of removedRoles.values()) {
    // Check if the "claimed" column is set to false for the removed role
    const { data: unclaimedRole } = await supabase
      .from('role_updates')
      .select('id')
      .eq('role', removedRole.name)
      .eq('user_id', newMember.id)
      .eq('claimed', false)
      .single();

    if (unclaimedRole) {
      // If the role is unclaimed, delete the row
      await supabase.from('role_updates').delete().eq('id', unclaimedRole.id);
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
