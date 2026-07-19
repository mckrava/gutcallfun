import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    createChallenge: jest.fn(),
    verify: jest.fn(),
    register: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    issueWsTicket: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    controller = moduleRef.get(AuthController);
  });

  it('delegates each route to AuthService', () => {
    controller.challenge({ wallet_address: 'w' });
    expect(authService.createChallenge).toHaveBeenCalledWith({
      wallet_address: 'w',
    });

    void controller.verify({ wallet_address: 'w', nonce: 'n', signature: 's' });
    expect(authService.verify).toHaveBeenCalledWith({
      wallet_address: 'w',
      nonce: 'n',
      signature: 's',
    });

    void controller.register({ registration_token: 't', handle: 'h' });
    expect(authService.register).toHaveBeenCalledWith({
      registration_token: 't',
      handle: 'h',
    });

    controller.refresh({ refresh_token: 'r' });
    expect(authService.refresh).toHaveBeenCalledWith({ refresh_token: 'r' });
  });

  it('logout revokes and returns an acknowledgement', () => {
    const result = controller.logout({ refresh_token: 'r' });
    expect(authService.logout).toHaveBeenCalledWith({ refresh_token: 'r' });
    expect(result).toEqual({ success: true });
  });

  it('ws-ticket mints a ticket for the authenticated user', () => {
    controller.wsTicket({ userId: 'u-1' });
    expect(authService.issueWsTicket).toHaveBeenCalledWith('u-1');
  });
});
