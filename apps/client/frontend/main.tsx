import { Text, View } from 'nsh'

/** Empty shell workbench — product UI lands here. */
export function ClientApp() {
  return (
    <View style={{ flex: 1, padding: 24, gap: 8, justifyContent: 'center' }}>
      <Text style={{ fontSize: 28, fontWeight: '600' }}>MyAid</Text>
      <Text style={{ fontSize: 15, opacity: 0.7 }}>
        Empty shell mirrored from dsh-bot. No business logic yet.
      </Text>
    </View>
  )
}
