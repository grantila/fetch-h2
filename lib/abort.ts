import { EventEmitter } from "events";


export const signalEvent = "internal-abort";

export interface AbortSignal extends EventEmitter
{
	readonly aborted: boolean;
	onabort: ( ) => void;
}

class AbortSignalImpl extends EventEmitter implements AbortSignal
{
	public aborted = false;

	constructor( )
	{
		super( );

		this.once( signalEvent, ( ) =>
		{
			this.aborted = true;
			this.emit( "abort" );
			this.onabort && this.onabort( );
		} );
	}

	public onabort = ( ) => { };
}

export class AbortController
{
	public readonly signal: AbortSignal = new AbortSignalImpl( );

	public abort = ( ) =>
	{
		this.signal.emit( signalEvent );
	}
}
