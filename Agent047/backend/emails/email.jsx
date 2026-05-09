import {
    Body,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Img,
    Link,
    Preview,
    Section,
    Text,
} from '@react-email/components';
import * as React from 'react';

export default function VerificationEmail({ verificationCode = '123456' }) {
    return (
        <Html>
            <Head />
            <Preview>Your Alphonso AI Verification Code</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Section style={header}>
                         <Heading style={logo}>ALPHONSO<span style={logoAccent}>AI</span></Heading>
                    </Section>
                    
                    <Section style={content}>
                        <Heading style={h1}>Verify Your Elite Access</Heading>
                        <Text style={text}>
                            Welcome to the next level of athletic performance. To complete your 
                            registration and unlock your personalized AI scouting reports, 
                            please use the verification code below:
                        </Text>
                        
                        <Section style={codeContainer}>
                            <Text style={codeLabel}>VERIFICATION CODE</Text>
                            <Text style={codeText}>{verificationCode}</Text>
                            <Text style={codeExpiry}>(This code is valid for 60 seconds)</Text>
                        </Section>

                        <Text style={text}>
                            If you didn't request this code, you can safely ignore this email.
                            Someone might have typed your email address by mistake.
                        </Text>
                        
                        <Hr style={hr} />
                        
                        <Text style={footer}>
                            Alphonso AI Performance Labs <br />
                            High-Performance Computing for the Modern Athlete
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}

// STYLES (Inline to ensure compatibility across all mail clients)
const main = {
    backgroundColor: '#0a0a0a',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
    margin: '0 auto',
    padding: '40px 20px',
    width: '580px',
};

const header = {
    textAlign: 'center',
    paddingBottom: '20px',
};

const logo = {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: '900',
    letterSpacing: '2px',
    margin: '0',
};

const logoAccent = {
    color: '#3b82f6', // Bright sports blue
};

const content = {
    backgroundColor: '#171717',
    borderRadius: '12px',
    padding: '40px',
    border: '1px solid #333',
};

const h1 = {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 'bold',
    textAlign: 'center',
    margin: '0 0 30px',
};

const text = {
    color: '#a3a3a3',
    fontSize: '15px',
    lineHeight: '24px',
    textAlign: 'center',
};

const codeContainer = {
    background: '#000',
    borderRadius: '8px',
    margin: '30px 0',
    padding: '20px',
    textAlign: 'center',
    border: '1px solid #3b82f6',
};

const codeLabel = {
    color: '#3b82f6',
    fontSize: '12px',
    fontWeight: 'bold',
    letterSpacing: '1px',
    margin: '0 0 10px',
};

const codeText = {
    color: '#ffffff',
    fontSize: '48px',
    fontWeight: 'bold',
    letterSpacing: '8px',
    margin: '0',
};

const codeExpiry = {
    color: '#525252',
    fontSize: '12px',
    margin: '10px 0 0',
};

const hr = {
    borderColor: '#333',
    margin: '30px 0',
};

const footer = {
    color: '#525252',
    fontSize: '12px',
    textAlign: 'center',
    lineHeight: '18px',
};