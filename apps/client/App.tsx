import { mount, signal, Text, View } from 'nsh'
import { Badge, Counter, Format } from 'myaid/native'

/** Mixed shell: TSX entry + Rust `myaid/native` (official `nsh init --template mixed`). */
const counter = new Counter()

function App() {
  const count = signal(counter.count)
  return (
    <View
      style={{
        flex: 1,
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: '600' }}>MyAid</Text>
      <Text style={{ fontSize: 15, opacity: 0.7 }}>
        NSH mixed shell — TSX + Rust crate. No product logic yet.
      </Text>
      <Text style={{ fontSize: 18 }}>
        {count() ? `Pressed ${Format.times(count())}` : 'Not pressed yet'}
      </Text>
      <Badge label="Press me" onPress={() => count.set(counter.increment())} />
    </View>
  )
}

mount(App)
