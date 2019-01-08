import { writeFileSync } from "fs";
import { resolve } from "path";

// tslint:disable-next-line
const { version } = require( "../package.json" );

const fileData = `export const version = "${version}";\n`;

writeFileSync( resolve( __dirname, "../lib/generated/version.ts" ), fileData );
