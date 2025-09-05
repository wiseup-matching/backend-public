import dotenv from 'dotenv';
dotenv.config();

import brevo from '@getbrevo/brevo';
import { NotificationInsertType } from '../db/schema';
import crypto from 'crypto';

// Import the shared tokenStore from auth routes
// We need to access the same tokenStore that auth.ts uses
let tokenStore: Map<string, { email: string; expiresAt: Date }>;

// This function will be called by auth.ts to set the tokenStore
export function setTokenStore(store: Map<string, { email: string; expiresAt: Date }>) {
  tokenStore = store;
}

if (!process.env.BREVO_API_KEY) {
  throw new Error('BREVO_API_KEY is not set in environment variables');
}

const defaultClient = brevo.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new brevo.TransactionalEmailsApi();

async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string,
  sender: { name: string; email: string } = { name: 'WiseUp', email: 'sebixd332@gmail.com' },
) {
  const sendSmtpEmail = {
    to: [{ email: to }],
    sender,
    subject,
    htmlContent,
  };

  try {
    // skip sending emails to example.com test addresses
    if (to.includes('@example.com')) return;

    await apiInstance.sendTransacEmail(sendSmtpEmail);
  } catch (error: any) {
    if (error.response) {
      console.error('Response body:', error.response.body);
      console.error('Request headers:', error.response.request?.header);
    }
    throw error;
  }
}

export async function sendMagicLinkEmail(
  email: string,
  token: string,
  userType: 'Retiree' | 'Startup',
  isRegistration = false,
) {
  // Magic link points directly to backend endpoint
  // Use BACKEND_URL if set, otherwise construct from FRONTEND_URL or default to localhost
  const backendUrl =
    process.env.BACKEND_URL ??
    (process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.replace('3000', '4000')
      : 'http://localhost:4000');

  // Add strict parameter for registration
  const strictParam = isRegistration ? '&strict=true' : '';
  const magicLink = `${backendUrl}/api/v1/verify-magiclink?token=${token}&userType=${userType}${strictParam}`;

  const isNewUser = isRegistration;
  const subject = isNewUser
    ? 'Welcome to WiseUp - Complete Your Registration'
    : 'Your WiseUp Login Link';

  const innerHtml = `
    <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); padding: 30px; border-radius: 12px; margin-bottom: 25px;">
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px; font-weight: 600;">
        ${isNewUser ? 'Welcome to WiseUp!' : 'Secure Login'}
      </h2>
      
      <p style="color: #374151; margin: 0 0 20px 0; font-size: 16px; line-height: 1.6;">
        ${
          isNewUser
            ? `Thank you for joining WiseUp! To complete your registration as a ${userType}, please click the button below.`
            : 'Click the button below to securely access your WiseUp account.'
        }
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${magicLink}" 
           style="display: inline-block; border: 1px solid #2f27ce; 
                  color: #2f27ce; padding: 16px 32px; text-decoration: none; border-radius: 8px; 
                  font-weight: 600; font-size: 16px;;
                  transition: all 0.2s ease;">
          ${isNewUser ? 'Complete Registration' : 'Login to WiseUp'}
        </a>
      </div>
      
      <p style="color: #1f2937; margin: 0; font-size: 14px; text-align: center;">
        🔒 This link is secure and valid for 15 minutes
      </p>
    </div>
    
    <div style="background: #f9fafb; padding: 20px; border-radius: 8px; border-left: 4px solid #2f27ce;">
      <p style="color: #374151; margin: 0; font-size: 14px; line-height: 1.5;">
        <strong>Security Note:</strong> If you didn't request this ${isNewUser ? 'registration' : 'login'}, 
        please ignore this email. This link can only be used once and will expire automatically.
      </p>
    </div>
  `;

  await sendEmail(email, subject, getMagicLinkEmailTemplate(innerHtml));
}

export async function sendNotificationEmail(email: string, notification: NotificationInsertType) {
  const subject = `New WiseUp Notification: ${notification.title}`;

  // Create magic links for each action that will auto-login the user and redirect to the target URL
  const actionLinks = await Promise.all(
    notification.actions.map(async (action) => {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      tokenStore.set(token, { email, expiresAt });

      // Clean up expired tokens
      for (const [storedToken, data] of tokenStore.entries()) {
        if (data.expiresAt < new Date()) {
          tokenStore.delete(storedToken);
        }
      }

      // Create a magic link that will redirect to the target URL after authentication
      const backendUrl =
        process.env.BACKEND_URL ??
        (process.env.FRONTEND_URL
          ? process.env.FRONTEND_URL.replace('3000', '4000')
          : 'http://localhost:4000');

      const magicLink = `${backendUrl}/api/v1/verify-magiclink?token=${token}&userType=auto&redirect=${encodeURIComponent(action.url)}`;

      return {
        ...action,
        url: magicLink,
      };
    }),
  );

  const actionsHtml = actionLinks
    .map(
      (action) => `
        <td style="padding:0 4px 10px 4px;">
          <a href="${action.url}" style="display:inline-block;padding:12px 24px;background-color:#fbfbfe;color:#2f27ce;text-decoration:none;border-radius:10px;border:1px solid #2f27ce;font-weight:600;font-size:14px;">
            ${action.label}
          </a>
        </td>
      `,
    )
    .join('');

  const innerHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-family:Arial,Helvetica,sans-serif;color:#050315;font-size:16px;padding-bottom:16px;">
          ${notification.message}
        </td>
      </tr>
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              ${actionsHtml}
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const htmlContent = getEmailTemplate(subject, innerHtml);

  // Skip sending in development
  if (process.env.NODE_ENV === 'development') return;

  await sendEmail(email, subject, htmlContent);
}

function getEmailTemplate(title: string, contentHtml: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="Margin:0;padding:0;background-color:#f3f4f6;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
        <tr>
          <td align="center" style="padding:20px 0;">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background-color:#fbfbfe;border:1px solid #d1d5db;border-radius:10px;padding:40px;">
              <tr>
                <td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:600;color:#2f27ce;padding-bottom:20px;">WiseUp</td>
              </tr>
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:600;color:#050315;padding-bottom:20px;text-align:center;">${title}</td>
              </tr>
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#050315;line-height:1.5;">
                  ${contentHtml}
                </td>
              </tr>
              <tr>
                <td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#707070;padding-top:30px;">
                  © 2025 WiseUp. All rights reserved.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function getMagicLinkEmailTemplate(contentHtml: string): string {
  return getEmailTemplate('Secure Access to WiseUp', contentHtml);
}
