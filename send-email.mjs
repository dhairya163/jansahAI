const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  console.error("Missing RESEND_API_KEY environment variable.");
  process.exit(1);
}

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: "complaints@shipjoy.io",
    to: ["parth.arora1614@gmail.com"],
    subject: process.env.EMAIL_SUBJECT ?? "Test email from Resend",
    text: process.env.EMAIL_BODY ?? "This is a test email sent using Resend.",
  }),
});

const result = await response.json();

if (!response.ok) {
  console.error("Resend API error:", result);
  process.exit(1);
}

console.log("Email sent:", result.id);
