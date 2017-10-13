'use strict'

import { writeFileSync } from 'fs'
import { resolve } from 'path'

const { version } = require( '../package.json' );

const fileData =
`'use strict'

export const version = '${version}';
`;

writeFileSync( resolve( __dirname, '../lib/generated/version.ts' ), fileData );
