import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { db } from "./config/db.js";
import * as schema from "./db/schema.js";

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
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        try {
          // For MVP: print to console
          console.log('\n' + '='.repeat(60));
          console.log('🔐 OTP Code Request');
          console.log('='.repeat(60));
          console.log('Email:', email);
          console.log('Code:', otp);
          console.log('Type:', type);
          console.log('Timestamp:', new Date().toISOString());
          console.log('='.repeat(60) + '\n');

          // TODO: Later integrate with email service (Resend, SendGrid, etc.)
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
