import { ClientHttp2Session } from "http2";


export interface MonkeyH2Session extends ClientHttp2Session
{
	__fetch_h2_destroyed?: boolean;
	__fetch_h2_goaway?: boolean;
	__fetch_h2_refcount: number;
}

export function hasGotGoaway( session: ClientHttp2Session )
{
	return !!( < MonkeyH2Session >session ).__fetch_h2_goaway;
}

export function setGotGoaway( session: ClientHttp2Session )
{
	( < MonkeyH2Session >session ).__fetch_h2_goaway = true;
}

export function isDestroyed( session: ClientHttp2Session )
{
	const monkeySession = < MonkeyH2Session >session;
	return monkeySession.destroyed || monkeySession.__fetch_h2_destroyed;
}

export function setDestroyed( session: ClientHttp2Session )
{
	( < MonkeyH2Session >session ).__fetch_h2_destroyed = true;
}
