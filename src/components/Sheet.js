import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors } from '../theme';

export default function Sheet({ visible, title, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.head}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}><Text style={styles.close}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView style={{ maxHeight: '100%' }} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '78%',
    backgroundColor: colors.bgElevated2, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderWidth: 1, borderColor: colors.line, borderBottomWidth: 0,
  },
  handle: { width: 36, height: 4, backgroundColor: colors.line, borderRadius: 4, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4 },
  title: { color: colors.text, fontSize: 16.5, fontWeight: '700' },
  close: { color: colors.textDim, fontSize: 16 },
});
