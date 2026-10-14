export type UserType = {
  uid: string;

  fullName: string;
  email: string;
  phone: string;
  location?: string;

  role: string;
  status: string;

  farmName?: string;
  street?: string;
  barangay?: string;
  municipality?: string;
  province?: string;
  about?: string;

  // Farm map pin (legacy — delivery is now priced from city + barangay).
  // Kept for old documents; new code must not read these for pricing.
  farmLat?: number | null;
  farmLng?: number | null;

  coverPhoto?: string;
  coverPhotoPublicId?: string;

  profileImage?: string;

  profileImagePublicId?: string;
};