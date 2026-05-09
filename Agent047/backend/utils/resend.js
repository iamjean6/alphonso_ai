import { Resend } from 'resend';
import { render } from '@react-email/render';
import VerificationEmail from '../emails/email.jsx'; // Pointing to the correct file
import * as React from 'react';

// Using the user's preferred environment variable name
const resend = new Resend(process.env.RESEND_API);

/**
 * Generates a secure 6-digit OTP
 */
export const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Sends a branded verification email to the user
 */
export const sendVerificationEmail = async (to, otp) => {
    try {
        console.log(`[Email Service] Preparing verification email for ${to}...`);

        // 1. Render the React component to HTML string
        const emailHtml = await render(
            React.createElement(VerificationEmail, { verificationCode: otp })
        );

        // 2. Dispatch via Resend
        const { data, error } = await resend.emails.send({
            from: 'Alphonso AI <onboarding@resend.dev>', 
            to: [to],
            subject: 'Verify Your Alphonso AI Access',
            html: emailHtml,
        });

        if (error) {
            console.error("[Resend API Error]:", JSON.stringify(error, null, 2));
            return { success: false, error: error.message || 'Verification Failed' };
        }

        console.log(`[Email Service] Success! ID: ${data.id}`);
        return { success: true, data };

    } catch (err) {
        console.error("[Email Service Critical Failure]:", err.stack);
        return { success: false, error: err.message };
    }
};