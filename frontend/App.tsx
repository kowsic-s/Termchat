import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import BootScreen from './src/screens/BootScreen';
import TerminalScreen from './src/screens/TerminalScreen';
import ChatScreen from './src/screens/ChatScreen';

export type RootStackParamList = {
  Boot: undefined;
  Terminal: undefined;
  Chat: { chatId: string; chatName: string; isGroup: boolean };
};

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" backgroundColor="#070A07" />
      <Stack.Navigator
        initialRouteName="Boot"
        screenOptions={{ headerShown: false, animationEnabled: false }}
      >
        <Stack.Screen name="Boot" component={BootScreen} />
        <Stack.Screen name="Terminal" component={TerminalScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}