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

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

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
    const enthusiast = isEnthusiastRole(addedRole.name);

    // Check if the role already exists in the table
    const { data: existingRole } = await supabase
      .from('role_updates')
      .select('id')
      .eq('role', addedRole.name)
      .single();
    console.log(existingRole);

    if (existingRole) {
      // If the role exists, update the row with the new user_id and timestamp
      await supabase
        .from('role_updates')
        .update({
          user_id: newMember.id,
          enthusiast,
          timestamp: new Date().toISOString(),
        })
        .eq('id', existingRole.id);
    } else {
      // If the role does not exist, insert a new row
      await supabase
        .from('role_updates')
        .insert([
          {
            user_id: newMember.id,
            role: addedRole.name,
            enthusiast,
            timestamp: new Date().toISOString(),
          },
        ])
        .single();
    }
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
