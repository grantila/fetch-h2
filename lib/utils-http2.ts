import { ClientHttp2Session } from "http2";

export function hasGotGoaway( session: ClientHttp2Session )
{
	return !!( < any >session ).__fetch_h2_goaway;
}

export function setGotGoaway( session: ClientHttp2Session )
{
	( < any >session ).__fetch_h2_goaway = true;
}
