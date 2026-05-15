/**
 * ALAT create-account-face API request/response DTOs
 * Base: https://apiplayground.alat.ng/create-account-face/api
 * Header: Ocp-Apim-Subscription-Key
 */

// --- Tier 1 ---
export interface AlatTier1Request {
  phoneNumber: string;
  email: string;
  bvn: string;
  correlationId: string;
}

export interface AlatTier1Response {
  message?: string;
  status?: boolean;
  code?: number;
  statusCode?: number;
  errors?: string[] | null;
  data?: {
    accountGenerationStatus?: string;
    trackingId?: string;
    addressVerificationStatus?: string | null;
  };
}

// --- Tier 2 ---
export interface AlatResidentialAddress {
  buildingNumber?: string;
  apartment?: string;
  street?: string;
  city?: string;
  town?: string;
  state?: string;
  lga?: string;
  lcda?: string;
  landmark?: string;
  additionalInformation?: string;
  country?: string;
  fullAddress?: string;
  postalCode?: string;
}

export interface AlatTier2Request {
  /** Omitted when Tier 1 was completed on the provider; they retain BVN server-side. */
  bvn?: string;
  nin: string;
  phoneNumber: string;
  emailAddress: string;
  residentialAddress: AlatResidentialAddress;
  liveImageOfFace: string;
  correlationId: string;
}

export interface AlatTier2Response {
  message?: string;
  status?: boolean;
  code?: number;
  statusCode?: number;
  errors?: string[] | null;
  data?: {
    accountGenerationStatus?: string;
    trackingId?: string;
    addressVerificationStatus?: string;
  };
}

// --- GetDropDownList ---
export interface AlatCountryItem {
  id: number;
  countryCode: string;
  countryName: string;
}

export interface AlatStateItem {
  id: number;
  name: string;
  finacleCode: string;
  country: string;
}

export interface AlatLgaItem {
  lgaId: number;
  stateId: number;
  name: string;
}

export interface AlatLcdaItem {
  lcdaId: number;
  lgaId: number;
  name: string;
}

export interface AlatCityItem {
  id: number;
  stateId: number;
  name: string;
}

export interface AlatHousingTypeItem {
  id: number;
  value: string;
  code: string;
}

export interface AlatCountryModel {
  countryList: AlatCountryItem[];
  stateList: AlatStateItem[];
  lgaList: AlatLgaItem[];
  lcdaList: AlatLcdaItem[];
  cityList: AlatCityItem[];
  housingTypes: AlatHousingTypeItem[];
}

export interface AlatGetDropDownListResponse {
  countryModel?: AlatCountryModel;
}

// --- GetPartnershipAccountDetails ---
export interface AlatPartnershipAccountDetails {
  accountNumber?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
}

export interface AlatGetPartnershipAccountDetailsResponse {
  message?: string;
  status?: boolean;
  code?: string;
  statusCode?: string;
  errors?: string[] | null;
  data?: AlatPartnershipAccountDetails;
}
