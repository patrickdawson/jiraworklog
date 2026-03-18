import dotenv from "dotenv";

dotenv.config({ quiet: true } as Parameters<typeof dotenv.config>[0]);
dotenv.config({ path: ".env.local", override: true, quiet: true } as Parameters<typeof dotenv.config>[0]);

import { run } from "./lib/run";

run();
