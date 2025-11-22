
import { Provider } from '@nestjs/common';
import admin from 'firebase-admin';
import { config } from 'dotenv';
config();

export const FIREBASE_ADMIN = 'FIREBASE_ADMIN';

export const FirebaseAdminProvider: Provider = {
  provide: FIREBASE_ADMIN,
  useFactory: () => {
    if (!admin.apps || admin.apps.length === 0) {
      // Option 1: Use GOOGLE_APPLICATION_CREDENTIALS env that points to the JSON file
      // admin.initializeApp();

      // Option 2: Use env vars for service account
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env
            .FIREBASE_PRIVATE_KEY
            ?.replace(/\\n/g, '\n'), // important if stored as single-line env
        }),
      });
    }

    return admin.app();
  },
};
