/** The authenticated principal attached to `req.user` by JwtStrategy. */
export interface AuthPrincipal {
  userId: string;
}

/** JWT payload shapes issued by AuthService. `typ` separates the two. */
export interface AccessClaims {
  sub: string; // user id
  typ: 'access';
}

export interface RegistrationClaims {
  sub: string; // wallet address — no user exists yet
  typ: 'reg';
}
