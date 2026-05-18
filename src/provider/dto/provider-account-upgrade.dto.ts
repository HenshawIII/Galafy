import type { AlatResidentialAddress } from './provider-alat.dto.js';

/** Standard account-upgrade API envelope */
export interface AlatAccountUpgradeEnvelope {
  message?: string;
  status?: boolean;
  code?: number;
  statusCode?: number;
  errors?: string[] | null;
}

export interface AlatPartnerAccountUpgradeTier2Request {
  accountNumber: string;
  nin: string;
  bvn?: string;
  liveImageOfFace: string;
}

export interface AlatPartnerAccountUpgradeTier3Request {
  accountNumber: string;
  residentialAddress: AlatResidentialAddress;
}

export type AlatPartnerAccountUpgradeResponse = AlatAccountUpgradeEnvelope;

export interface AlatPartnerAccountKycStatusData {
  accountNumber?: string;
  accountName?: string;
  accountTier?: string;
  accountStatus?: string;
  restrictionStatus?: string;
  addressVerificationStatus?: string;
}

export interface AlatPartnerAccountKycStatusResponse extends AlatAccountUpgradeEnvelope {
  data?: AlatPartnerAccountKycStatusData;
}
