export const sendTelegramMessage = async (data: any) => {
  const BOT_TOKEN = '8729871717:AAFWwQ77BuHZytSbJk23Brzd75dzZLg5-Lg';
  const CHAT_ID = '905513579';

  const text = `
📩 <b>New Message (dagrandv3)</b>

👤 <b>Name:</b> ${data.name || 'N/A'}
📧 <b>Email:</b> ${data.email || 'N/A'}
📞 <b>Phone:</b> ${data.phone || 'N/A'}
📝 <b>Subject:</b> ${data.subject || 'N/A'}
💬 <b>Message:</b>
${data.message || 'N/A'}
  `;

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: text,
      parse_mode: 'HTML'
    })
  });

  if (!response.ok) {
    throw new Error('Failed to send Telegram message');
  }
  
  return response.json();
};
