import { Firestore } from "@google-cloud/firestore";

/**
 * Firestore is the store on Cloud Run, where the container's disk is wiped on every restart.
 * It is chosen automatically there (Cloud Run sets K_SERVICE) or with STORE=firestore. Locally the
 * app keeps using SQLite or JSON files in `.data/`. Credentials and the project come from the
 * environment (the Cloud Run service account), so nothing is configured in code.
 */
export const useFirestore = (): boolean => Boolean(process.env.K_SERVICE) || process.env.STORE === "firestore";

let db: Firestore | undefined;
export const firestore = (): Firestore => (db ??= new Firestore({ ignoreUndefinedProperties: true }));
