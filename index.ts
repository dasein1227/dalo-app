import 'react-native-gesture-handler';
import 'react-native-reanimated';

import './src/lib/push/pushTaskRegistration';
import './src/i18n';

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
