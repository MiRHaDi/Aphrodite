export type TransportPhase='header'|'identity'|'accounting'|'destination'|'transfer';
export function transportFailure(error:unknown,phase:TransportPhase){
 const message=error instanceof Error?error.message:'';
 const code=/proxy request failed|disallowed address/i.test(message)?'DESTINATION_REJECTED'
  :/TCP Loop/i.test(message)?'SOCKET_LOOP'
  :/lookup failed|DNS/i.test(message)?'DNS_FAILED'
  :/timeout/i.test(message)?'TIMEOUT'
  :/Relay credential|No relay route|Socket transport is not configured/i.test(message)?'TRANSPORT_NOT_CONFIGURED'
  :phase==='destination'?'CONNECT_FAILED'
  :phase==='identity'?'IDENTITY_FAILED'
  :phase==='accounting'?'ACCOUNTING_FAILED'
  :phase==='header'?'INVALID_HEADER':'TRANSFER_FAILED';
 // Never log raw exception messages, destinations, user identities or credentials.
 return {event:'native_transport_failure',phase,code};
}
