const { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

let anonymousChannels = new Collection();
let customAnonymousName = new Collection();

const DATA_PATH = path.join(__dirname, 'data.json');

// Function to save data
async function saveData() {
  const data = {
    anonymousChannels: Array.from(anonymousChannels.entries()),
    customAnonymousName: Array.from(customAnonymousName.entries()),
  };
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2));
}

// Function to load data
async function loadData() {
  try {
    const data = JSON.parse(await fs.readFile(DATA_PATH, 'utf-8'));
    anonymousChannels = new Collection(data.anonymousChannels);
    customAnonymousName = new Collection(data.customAnonymousName);
  } catch (error) {
    console.log('No existing data found or error reading file:', error.message);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('himitsu')
    .setDescription('Toggles anonymous chat mode for the current channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Change bot settings')
    .addSubcommand(subcommand =>
      subcommand
        .setName('name')
        .setDescription('Set the name for anonymous users')
        .addStringOption(option =>
          option.setName('value')
            .setDescription('Name to use for anonymous users')
            .setRequired(true)
        )
    )
];

const rest = new REST({ version: '10' }).setToken(token);

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  await loadData();  // Load saved data when bot starts

  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
	return interaction.reply({ content: 'This command can only be used by administrators.', ephemeral: true });
  }

  if (interaction.commandName === 'himitsu') {
    await handleAnonymousSetup(interaction);
  } else if (interaction.commandName === 'config') {
    if (interaction.options.getSubcommand() === 'name') {
      const customName = interaction.options.getString('value');
      const channelId = interaction.channelId;
      
      customAnonymousName.set(channelId, customName);
      await saveData();  // Save data after updating
	  await interaction.reply({ content: `Anonymous user name has been set to "${customName}".`, ephemeral: true });
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (anonymousChannels.has(message.channel.id)) {
    await handleAnonymousMessage(message);
  }
});

async function handleAnonymousSetup(interaction) {
  const channelId = interaction.channelId;
  if (anonymousChannels.has(channelId)) {
    anonymousChannels.delete(channelId);
	await interaction.reply({ content: 'Anonymous chat mode has been disabled for this channel.', ephemeral: true });
  } else {
    anonymousChannels.set(channelId, true);
	await interaction.reply({ content: 'Anonymous chat mode has been enabled for this channel.', ephemeral: true });
  }
  await saveData();  // Save data after updating
}

async function handleAnonymousMessage(message) {
  try {
    let content = message.content;
    let attachments = [];

    if (message.attachments.size > 0) {
      for (let attachment of message.attachments.values()) {
        try {
          const response = await fetch(attachment.url);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const buffer = await response.buffer();

          attachments.push({
            name: attachment.name,
            attachment: buffer
          });
        } catch (error) {
          console.error(`Error processing attachment: ${error.message}`);
          continue;
        }
      }
    }

    const anonymousName = `${customAnonymousName.get(message.channel.id) || 'Anonymous'} ${Math.floor(Math.random() * 1000)}`;
    
    await message.channel.send({
      content: `${anonymousName}: ${content}`,
      files: attachments
    });

    await message.delete();

  } catch (error) {
    console.error(`Error in handleAnonymousMessage: ${error.message}`);
    await message.channel.send(`An error occurred while processing the message.`);
  }
}


client.login(token);
