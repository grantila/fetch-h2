import * as path from "path"
import {
	readFile as fsReadFile,
	writeFile as fsWriteFile,
} from "fs"
import { promisify } from "util"

import * as readdir from "recursive-readdir"
import * as execa from "execa"
import * as libRimraf from "rimraf"


const readFile = promisify( fsReadFile );
const writeFile = promisify( fsWriteFile );
const rimraf = promisify( libRimraf );

async function createExportedTests( )
{
	const root = path.join( __dirname, ".." );
	const source = path.join( root, "test" );
	const target = path.join( root, "test-exported" );

	await rimraf( target );

	await execa( "cp", [ "-r", source, target ] );

	const files = await readdir( target );

	for ( const filename of files )
	{
		const data = await readFile( filename, 'utf8' );
		await writeFile(
			filename,
			data
				.replace( "../../index", "../../dist" )
				.replace( "../../lib", "../../dist/lib" )
		);
	}
}

createExportedTests( )
.catch( err =>
{
	console.error( err.stack );
	process.exit( 1 );
} );
