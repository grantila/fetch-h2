import { createHash } from 'crypto';

export function createIntegrity( data: string, hashType = 'sha256' )
{
	const hash = createHash( hashType );
	hash.update( data );
	return hashType + "-" + hash.digest( "base64" );
}
