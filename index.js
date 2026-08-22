// bot.js
// ============================================================
// Discord bot that joins/leaves voice channels.
// Reads config from config.json instead of .env.
// ============================================================

import { readFileSync } from 'fs';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';

// ---- Load config ----
const config = JSON.parse(readFileSync('config.json', 'utf8'));
const { token, clientId } = config;

// ---- Bot client ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ---- Slash commands ----
const commands = [
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join your current voice channel'),
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the voice channel'),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), {
    body: commands,
  });
  console.log('✅ Slash commands registered.');
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // ---- /join ----
  if (interaction.commandName === 'join') {
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      await interaction.reply({
        content: 'You need to be in a voice channel first.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      await interaction.editReply(`Joined **${voiceChannel.name}**.`);
    } catch (err) {
      console.error('❌ Voice connection failed:', err);
      const conn = getVoiceConnection(voiceChannel.guild.id);
      if (conn) conn.destroy();
      await interaction.editReply(
        'Failed to join the voice channel. This is usually a networking issue on the host (voice needs outbound UDP, which some hosts block) rather than a code problem.'
      );
    }
  }

  // ---- /leave ----
  if (interaction.commandName === 'leave') {
    const connection = getVoiceConnection(interaction.guildId);
    if (!connection) {
      await interaction.reply({
        content: "I'm not in a voice channel.",
        ephemeral: true,
      });
      return;
    }
    connection.destroy();
    await interaction.reply('Left the voice channel.');
  }
});

client.login(token);
