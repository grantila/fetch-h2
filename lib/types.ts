import {
	IncomingHttpHeaders as IncomingHttpHeadersH1,
} from "http";

import {
	// 	ClientHttp2Stream,
	// 	constants as h2constants,
	IncomingHttpHeaders as IncomingHttpHeadersH2,
} from "http2";

export type IncomingHttpHeaders =
	IncomingHttpHeadersH1 | IncomingHttpHeadersH2;
