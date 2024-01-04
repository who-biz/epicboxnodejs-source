use sha2::{Digest, Sha256};

use crate::error::{Error, ResultSingle};
use super::base58::{FromBase58, ToBase58};
use super::secp::{Message, Secp256k1, Signature, Commitment, PublicKey, SecretKey};
use super::{from_hex, to_hex};

pub trait Hex<T> {
    fn from_hex(str: &str) -> ResultSingle<T>;
    fn to_hex(&self) -> String;
}

pub trait Base58<T> {
    fn from_base58(str: &str) -> ResultSingle<T>;
    fn to_base58(&self) -> String;

    fn from_base58_check(str: &str, version_bytes: Vec<u8>) -> ResultSingle<T>;
    fn from_base58_check_raw(str: &str, version_bytes: usize) -> ResultSingle<(T, Vec<u8>)>;
    fn to_base58_check(&self, version: Vec<u8>) -> String;
}

fn serialize_public_key(public_key: &PublicKey) -> Vec<u8> {
    let secp = Secp256k1::new();
    let ser = public_key.serialize_vec(&secp, true);
    ser[..].to_vec()
}

impl Hex<PublicKey> for PublicKey {
    fn from_hex(str: &str) -> ResultSingle<PublicKey> {
        let secp = Secp256k1::new();
        let hex = from_hex(str.to_string())?;
        PublicKey::from_slice(&secp, &hex).map_err(|_| Error::InvalidBase58Key.into())
    }

    fn to_hex(&self) -> String {
        to_hex(serialize_public_key(self))
    }
}

impl Base58<PublicKey> for PublicKey {
    fn from_base58(str: &str) -> ResultSingle<PublicKey> {
        let secp = Secp256k1::new();
        let str = str::from_base58(str)?;
        PublicKey::from_slice(&secp, &str).map_err(|_| Error::InvalidBase58Key.into())
    }

    fn to_base58(&self) -> String {
        serialize_public_key(self).to_base58()
    }

    fn from_base58_check_raw(str: &str, version_bytes: usize) -> ResultSingle<(PublicKey, Vec<u8>)> {
        let secp = Secp256k1::new();
        let (version_bytes, key_bytes) = str::from_base58_check(str, version_bytes)?;
        let public_key = PublicKey::from_slice(&secp, &key_bytes).map_err(|_| Error::InvalidBase58Key)?;
        Ok((public_key, version_bytes))
    }

    fn from_base58_check(str: &str, version_expect: Vec<u8>) -> ResultSingle<PublicKey> {
        let secp = Secp256k1::new();
        let n_version = version_expect.len();
        let (version_actual, key_bytes) = str::from_base58_check(str, n_version)?;
        if version_actual != version_expect {
            return Err(Error::InvalidBase58Version.into());
        }
        PublicKey::from_slice(&secp, &key_bytes).map_err(|_| Error::InvalidBase58Key.into())
    }

    fn to_base58_check(&self, version: Vec<u8>) -> String {
        serialize_public_key(self).to_base58_check(version)
    }
}

impl Hex<Signature> for Signature {
    fn from_hex(str: &str) -> ResultSingle<Signature> {
        let secp = Secp256k1::new();
        let hex = from_hex(str.to_string())?;
        Signature::from_der(&secp, &hex).map_err(|e| Error::SecpError(e))
    }

    fn to_hex(&self) -> String {
        let secp = Secp256k1::new();
        let signature = self.serialize_der(&secp);
        to_hex(signature)
    }
}

impl Hex<SecretKey> for SecretKey {
    fn from_hex(str: &str) -> ResultSingle<SecretKey> {
        let secp = Secp256k1::new();
        let data = from_hex(str.to_string())?;
        SecretKey::from_slice(&secp, &data).map_err(|e| Error::SecpError(e))
    }

    fn to_hex(&self) -> String {
        to_hex(self.0.to_vec())
    }
}

impl Hex<Commitment> for Commitment {
    fn from_hex(str: &str) -> ResultSingle<Commitment> {
        let data = from_hex(str.to_string())?;
        Ok(Commitment::from_vec(data))
    }

    fn to_hex(&self) -> String {
        to_hex(self.0.to_vec())
    }
}

pub fn public_key_from_secret_key(secret_key: &SecretKey) -> ResultSingle<PublicKey> {
    let secp = Secp256k1::new();
    PublicKey::from_secret_key(&secp, secret_key).map_err(|e| Error::SecpError(e))
}

pub fn sign_challenge(challenge: &str, secret_key: &SecretKey) -> ResultSingle<Signature> {
    let mut hasher = Sha256::new();
    hasher.input(challenge.as_bytes());
    let message = Message::from_slice(hasher.result().as_slice())?;
    let secp = Secp256k1::new();
    secp.sign(&message, secret_key)
        .map_err(|e| Error::SecpError(e))
}

pub fn verify_signature(
    challenge: &str,
    signature: &Signature,
    public_key: &PublicKey,
) -> ResultSingle<()> {
    let mut hasher = Sha256::new();
    hasher.input(challenge.as_bytes());
    let message = Message::from_slice(hasher.result().as_slice())?;
    let secp = Secp256k1::new();
    secp.verify(&message, signature, public_key)
        .map_err(|e| Error::SecpError(e))
}
