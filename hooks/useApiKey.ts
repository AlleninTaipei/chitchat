"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "chitchat_api_key";

export interface UseApiKeyReturn {
  apiKey: string | null | false; // null=loading, false=no key
  isLoading: boolean;
  showModal: boolean;
  openModal: () => void;
  closeModal: () => void;
  saveKey: (key: string) => void;
  clearKey: () => void;
  isUsingUserKey: boolean;
}

export function useApiKey(): UseApiKeyReturn {
  const [apiKey, setApiKey] = useState<string | null | false>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isUsingUserKey, setIsUsingUserKey] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/check-key");
        const { hasKey } = await res.json();

        if (hasKey) {
          setApiKey("__env__");
          setIsUsingUserKey(false);
        } else {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            setApiKey(stored);
            setIsUsingUserKey(true);
          } else {
            setApiKey(false);
            setShowModal(true);
          }
        }
      } catch {
        // If check-key fails, fall through to localStorage
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          setApiKey(stored);
          setIsUsingUserKey(true);
        } else {
          setApiKey(false);
          setShowModal(true);
        }
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, []);

  const openModal = useCallback(() => setShowModal(true), []);

  const closeModal = useCallback(() => setShowModal(false), []);

  const saveKey = useCallback((key: string) => {
    localStorage.setItem(STORAGE_KEY, key);
    setApiKey(key);
    setIsUsingUserKey(true);
    setShowModal(false);
  }, []);

  const clearKey = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey(false);
    setIsUsingUserKey(false);
    setShowModal(true);
  }, []);

  return {
    apiKey,
    isLoading,
    showModal,
    openModal,
    closeModal,
    saveKey,
    clearKey,
    isUsingUserKey,
  };
}
