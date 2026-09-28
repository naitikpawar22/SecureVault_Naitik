import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  generateUserKeyPair,
  exportPublicKey,
  exportPrivateKey,
  encryptPrivateKeyWithPassword,
  decryptPrivateKeyWithPassword,
  importPrivateKey,
} from '../utils/crypto';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [privateKey, setPrivateKey] = useState(null); // CryptoKey kept strictly in client memory
  const [loading, setLoading] = useState(true);

  // Restore session on page refresh
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('securevault_token');
      const savedUserStr = localStorage.getItem('securevault_user');
      const cachedPrivKeyJwk =
        sessionStorage.getItem('securevault_session_privkey') ||
        localStorage.getItem('securevault_privkey_cache');

      if (token && savedUserStr) {
        try {
          const parsedUser = JSON.parse(savedUserStr);
          setUser(parsedUser);

          if (cachedPrivKeyJwk) {
            const importedKey = await importPrivateKey(JSON.parse(cachedPrivKeyJwk));
            setPrivateKey(importedKey);
          }
        } catch (err) {
          console.warn('Session restoration failed:', err);
          logout();
        }
      }
      setLoading(false);
    };

    initAuth();

    // Listen for global auth expiration events
    const handleExpired = () => logout();
    window.addEventListener('auth_expired', handleExpired);
    return () => window.removeEventListener('auth_expired', handleExpired);
  }, []);

  /**
   * Step 1 of User Registration: Generates browser keypair, registers account, and returns session for MFA setup
   */
  const prepareRegistration = async (name, email, password) => {
    // 1. Generate ECDH Keypair in browser
    const keyPair = await generateUserKeyPair();
    const publicJwk = await exportPublicKey(keyPair.publicKey);
    const privateJwk = await exportPrivateKey(keyPair.privateKey);

    // 2. Encrypt private key client-side using password KEK
    const encryptedPrivateKeyBundle = await encryptPrivateKeyWithPassword(privateJwk, password);

    // 3. Register user with server
    const response = await api.auth.register({
      name,
      email,
      password,
      publicKey: publicJwk,
      encryptedPrivateKey: encryptedPrivateKeyBundle,
    });

    // 4. Temporarily save token so subsequent setupMfa call is authorized
    localStorage.setItem('securevault_token', response.accessToken);
    sessionStorage.setItem('securevault_session_privkey', JSON.stringify(privateJwk));
    localStorage.setItem('securevault_privkey_cache', JSON.stringify(privateJwk));

    return {
      response,
      keyPair,
      privateJwk,
    };
  };

  /**
   * Complete registration session (called after MFA setup or if skipped)
   */
  const completeRegistration = (responseUser, token, cryptoKey) => {
    if (token) localStorage.setItem('securevault_token', token);
    localStorage.setItem('securevault_user', JSON.stringify(responseUser));
    setUser(responseUser);
    if (cryptoKey) setPrivateKey(cryptoKey);
  };

  /**
   * User Registration with Zero-Knowledge Keypair Generation (direct)
   */
  const register = async (name, email, password) => {
    const { response, keyPair, privateJwk } = await prepareRegistration(name, email, password);

    localStorage.setItem('securevault_user', JSON.stringify(response.user));
    setUser(response.user);
    setPrivateKey(keyPair.privateKey);

    return response;
  };

  /**
   * User Login & In-Browser Private Key Decryption
   */
  const login = async (email, password) => {
    const response = await api.auth.login({ email, password });

    localStorage.setItem('securevault_token', response.accessToken);

    // Decrypt the user's private key in the browser using their password
    if (response.user.encryptedPrivateKey) {
      try {
        const decryptedKey = await decryptPrivateKeyWithPassword(
          response.user.encryptedPrivateKey,
          password
        );
        const privateJwk = await exportPrivateKey(decryptedKey);
        sessionStorage.setItem('securevault_session_privkey', JSON.stringify(privateJwk));
        localStorage.setItem('securevault_privkey_cache', JSON.stringify(privateJwk));
        setPrivateKey(decryptedKey);
      } catch (keyErr) {
        console.error('Failed to decrypt user private key:', keyErr);
        throw new Error('Incorrect password or corrupted encryption bundle.');
      }
    }

    // If MFA is required and not verified yet, do not set user in state so LoginPage remains on MFA screen
    if (!response.mfaRequired || response.mfaVerified) {
      localStorage.setItem('securevault_user', JSON.stringify(response.user));
      setUser(response.user);
    }

    return response;
  };

  /**
   * Unlock Private Key for active session using user's password
   */
  const unlockPrivateKey = async (password) => {
    let currentUser = user;
    if (!currentUser || !currentUser.encryptedPrivateKey) {
      const meRes = await api.auth.getMe();
      currentUser = meRes.user;
      setUser(currentUser);
      localStorage.setItem('securevault_user', JSON.stringify(currentUser));
    }

    if (!currentUser.encryptedPrivateKey) {
      throw new Error('No encrypted private key found for this user account.');
    }

    try {
      const decryptedKey = await decryptPrivateKeyWithPassword(
        currentUser.encryptedPrivateKey,
        password
      );
      const privateJwk = await exportPrivateKey(decryptedKey);
      sessionStorage.setItem('securevault_session_privkey', JSON.stringify(privateJwk));
      localStorage.setItem('securevault_privkey_cache', JSON.stringify(privateJwk));
      setPrivateKey(decryptedKey);
      return decryptedKey;
    } catch (err) {
      console.error('Failed to unlock private key:', err);
      throw new Error('Incorrect password. Could not decrypt your private key.');
    }
  };

  /**
   * Logout and clear all secrets from memory
   */
  const logout = async () => {
    try {
      await api.auth.logout();
    } catch (e) {
      // Ignore network errors during logout
    }
    localStorage.removeItem('securevault_token');
    localStorage.removeItem('securevault_user');
    sessionStorage.removeItem('securevault_session_privkey');
    localStorage.removeItem('securevault_privkey_cache');
    setUser(null);
    setPrivateKey(null);
  };

  const updateUser = (updatedFields) => {
    setUser((prev) => {
      const updated = { ...prev, ...updatedFields };
      localStorage.setItem('securevault_user', JSON.stringify(updated));
      return updated;
    });
  };

  const setSessionAuth = (token, updatedUser) => {
    if (token) localStorage.setItem('securevault_token', token);
    if (updatedUser) {
      localStorage.setItem('securevault_user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        updateUser,
        setSessionAuth,
        privateKey,
        setPrivateKey,
        isAuthenticated: Boolean(user && user.id && (!user.mfaEnabled || user.mfaVerified !== false)),
        loading,
        register,
        prepareRegistration,
        completeRegistration,
        login,
        unlockPrivateKey,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
