export interface Post {
  id: number;
  content: string;
  author_name: string;
  signature: string | null;
  pubkey: string | null;
  tx_id: string | null;
  created_at: string;
}

export interface Identity {
  name: string;
  address: string;
  wif: string;
}



