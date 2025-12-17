import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { Resend } from "resend";
import { db } from "./config/db.js";
import * as schema from "./db/schema.js";

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  baseURL: process.env.BACKEND_URL || 'http://localhost:4000',
  basePath: '/api/auth',
  trustedOrigins: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:4000'
  ],
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  emailAndPassword: {
    enabled: false, // We only want OTP
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
      },
    },
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        try {
          if (!process.env.RESEND_API_KEY) {
            // Fallback for development/missing key
            console.log('\n' + '='.repeat(60));
            console.log('🔐 OTP Code Request');
            console.log('='.repeat(60));
            console.log('Email:', email);
            console.log('Code:', otp);
            console.log('Type:', type);
            console.log('Timestamp:', new Date().toISOString());
            console.log('='.repeat(60) + '\n');
            return;
          }

          const { error } = await resend.emails.send({
            from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
            to: email,
            subject: 'Your Verification Code',
            html: `<p>Your verification code is: <strong>${otp}</strong></p>`,
          });

          if (error) {
            console.error('Error sending email:', error);
            throw new Error(error.message);
          }
        } catch (error) {
          console.error('Error in sendVerificationOTP:', error);
          throw error;
        }
      },
      expiresIn: 300, // 5 minutes
      otpLength: 6, // 6-digit code
    }),
  ],
});
