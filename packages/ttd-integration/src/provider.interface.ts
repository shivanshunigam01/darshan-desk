import type {
  AuthorizedAccountSummary,
  CountryDetail,
  Envelope,
  IntegrationStatus,
  PersonLimitResult,
  QuotaSummary,
  TrustDetail,
} from "./types.js";

export interface TTDProvider {
  getCountryDetails(): Promise<Envelope<{ countries: CountryDetail[] }>>;
  getTrustDetails(): Promise<Envelope<{ trusts: TrustDetail[] }>>;
  getQuotaSummary(): Promise<Envelope<QuotaSummary>>;
  getPermittedPersonCount(amount: number): Promise<Envelope<PersonLimitResult>>;
  getAuthorizedAccountSummary(
    userId: string
  ): Promise<Envelope<AuthorizedAccountSummary>>;
  getIntegrationStatus(): IntegrationStatus;
}