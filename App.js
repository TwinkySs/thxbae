// Checkys — оболочка для Expo Go: открывает веб-приложение, запущенное на ноутбуке (server.js), во весь экран телефона.
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, StatusBar, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

export default function App() {
  const [addr, setAddr] = useState('');
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(false);
  const top = Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 48;
  const connect = () => {
    const a = addr.trim().replace(/^https?:\/\//, '');
    if (!a) return;
    setErr(false);
    setUrl('http://' + (a.includes(':') ? a : a + ':3000'));
  };
  if (!url || err) return (
    <View style={[s.box, { paddingTop: top + 40 }]}>
      <Text style={s.logo}>Checkys</Text>
      <Text style={s.t}>Введите адрес ноутбука из консоли сервера{'\n'}(например 192.168.1.5). Телефон и ноутбук — в одной сети.</Text>
      <TextInput style={s.in} value={addr} onChangeText={setAddr} placeholder="192.168.1.5" keyboardType="numbers-and-punctuation" autoCapitalize="none" autoCorrect={false} />
      {err && <Text style={s.err}>Не удалось подключиться. Проверьте адрес, что сервер запущен и что обе устройства в одной сети.</Text>}
      <TouchableOpacity style={s.btn} onPress={connect}><Text style={s.bt}>Подключиться</Text></TouchableOpacity>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: top }}>
      <WebView source={{ uri: url }} style={{ flex: 1 }} startInLoadingState renderLoading={() => <ActivityIndicator style={{ flex: 1 }} size="large" color="#1a6bf0" />}
        onError={() => setErr(true)} onHttpError={() => setErr(true)} javaScriptEnabled domStorageEnabled />
    </View>
  );
}
const s = StyleSheet.create({
  box: { flex: 1, backgroundColor: '#fff', padding: 24 },
  logo: { fontSize: 36, fontWeight: '800', color: '#1a6bf0', marginBottom: 16 },
  t: { color: '#5a6b80', fontSize: 15, marginBottom: 16 },
  in: { borderWidth: 1, borderColor: '#dbe6f5', borderRadius: 12, padding: 14, fontSize: 18 },
  btn: { backgroundColor: '#1a6bf0', borderRadius: 12, padding: 15, marginTop: 14 },
  bt: { color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 16 },
  err: { color: '#d92d20', marginTop: 10 },
});
