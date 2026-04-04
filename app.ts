#!/usr/bin/env node
import dotenv from "dotenv";
import { run } from "./lib/run";

dotenv.config({ quiet: true });
dotenv.config({ path: ".env.local", override: true, quiet: true });

run();
