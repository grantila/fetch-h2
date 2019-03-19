import { createHash } from "crypto";

import {
	Response,
} from "../../index";


export function createIntegrity( data: string, hashType = "sha256" )
{
	const hash = createHash( hashType );
	hash.update( data );
	return hashType + "-" + hash.digest( "base64" );
}

export const cleanUrl = ( url: string ) =>
	url.replace( /^http[12]:\/\//, "http://" );

export function ensureStatusSuccess( response: Response ): Response
{
	if ( response.status < 200 || response.status >= 300 )
		throw new Error( "Status not 2xx" );
	return response;
}
