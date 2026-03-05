import AsyncStorage from '@react-native-async-storage/async-storage';

export const Storage = {
  save: async (key: string, value: string) => {
    await AsyncStorage.setItem(key, value);
  },
  get: async (key: string) => {
    return await AsyncStorage.getItem(key);
  },
  remove: async (key: string) => {
    await AsyncStorage.removeItem(key);
  },
  clear: async () => {
    await AsyncStorage.clear();
  }
};