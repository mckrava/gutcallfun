import { Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { LiveBroadcastEmitter } from '../live/events/live-broadcast.emitter';
import { LiveStateService } from '../live/live-state.service';
import { RealtimeGateway } from './realtime.gateway';

interface SocketData {
  user?: { userId: string };
}

function makeSocket(auth: unknown) {
  const disconnect = jest.fn();
  const data: SocketData = {};
  const client = {
    id: 'socket-1',
    handshake: { auth },
    data,
    disconnect,
  } as unknown as Socket;
  return { client, disconnect, data };
}

describe('RealtimeGateway.handleConnection (WS ticket auth)', () => {
  const auth = { consumeWsTicket: jest.fn() };
  const gateway = new RealtimeGateway(
    {} as unknown as LiveBroadcastEmitter,
    {} as unknown as LiveStateService,
    auth as unknown as AuthService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('pins the user to the socket for a valid ticket', () => {
    auth.consumeWsTicket.mockReturnValue('user-42');
    const { client, disconnect, data } = makeSocket({ ticket: 'good-ticket' });

    gateway.handleConnection(client);

    expect(auth.consumeWsTicket).toHaveBeenCalledWith('good-ticket');
    expect(data.user).toEqual({ userId: 'user-42' });
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('disconnects when the ticket is invalid/expired (consume returns null)', () => {
    auth.consumeWsTicket.mockReturnValue(null);
    const { client, disconnect, data } = makeSocket({ ticket: 'stale' });

    gateway.handleConnection(client);

    expect(disconnect).toHaveBeenCalled();
    expect(data.user).toBeUndefined();
  });

  it('disconnects when no ticket is provided (and never touches the store)', () => {
    const { client, disconnect } = makeSocket({});

    gateway.handleConnection(client);

    expect(auth.consumeWsTicket).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });
});
