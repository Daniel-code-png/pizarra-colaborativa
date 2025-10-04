// create-channels-from-file.js
require("dotenv").config();
const fs = require("fs");
const { parse } = require("csv-parse/sync");
const { WebClient } = require("@slack/web-api");

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error("❌ ERROR: SLACK_BOT_TOKEN no está en el .env");
  process.exit(1);
}

const slack = new WebClient(token);

// 📌 Leer CSV
function loadCSV(path) {
  const data = fs.readFileSync(path, "utf8");
  return parse(data, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: node create-channels-from-file.js channels.csv");
    process.exit(1);
  }

  const channels = loadCSV(file);

  for (const ch of channels) {
    try {
      console.log(`\n➡️ Procesando canal: ${ch.channel_name}`);

      // 1️⃣ Crear canal
      let created;
      try {
        const res = await slack.conversations.create({
          name: ch.channel_name,
          is_private: ch.is_private.toLowerCase() === "true",
        });
        created = res.channel;
        console.log(`✅ Canal creado: ${created.id} (${created.name})`);
      } catch (err) {
        if (err.data && err.data.error === "name_taken") {
          // Si ya existe, obtenerlo
          const res = await slack.conversations.list({ exclude_archived: true });
          created = res.channels.find(c => c.name === ch.channel_name);
          console.log(`⚠️ Canal ya existía: ${created.id} (${created.name})`);
        } else {
          throw err;
        }
      }

      // 2️⃣ Asignar topic si existe
      if (ch.topic && ch.topic.trim() !== "") {
        await slack.conversations.setTopic({
          channel: created.id,
          topic: ch.topic,
        });
        console.log(`📌 Topic asignado: ${ch.topic}`);
      }

      // 3️⃣ Invitar usuarios por email
      if (ch.invite_emails) {
        const emails = ch.invite_emails.split(/[,;]+/).map(e => e.trim()).filter(Boolean);
        for (const email of emails) {
          try {
            const userRes = await slack.users.lookupByEmail({ email });
            const userId = userRes.user.id;

            await slack.conversations.invite({
              channel: created.id,
              users: userId,
            });

            console.log(`👤 Invitado: ${email} (${userId})`);
          } catch (err) {
            if (err.data && err.data.error === "already_in_channel") {
              console.log(`⚠️ ${email} ya está en el canal.`);
            } else if (err.data && err.data.error === "users_not_found") {
              console.log(`❌ Usuario no encontrado en Slack: ${email}`);
            } else {
              console.error(`❌ Error invitando a ${email}:`, err.data || err);
            }
          }
        }
      }

    } catch (err) {
      console.error("❌ Error procesando canal:", err);
    }
  }

  console.log("\n🎉 Proceso completado.");
}

main();
