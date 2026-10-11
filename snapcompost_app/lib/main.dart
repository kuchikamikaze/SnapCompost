// SnapCompost — entry point aplikasi.
// Tahap A: shell navigasi 3-tab + 3 placeholder screen.
// Tema mengikuti palette web prototype (hijau #24734E sebagai seed).

import 'package:flutter/material.dart';

void main() {
  runApp(const SnapCompostApp());
}

/// Root aplikasi SnapCompost.
class SnapCompostApp extends StatelessWidget {
  const SnapCompostApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SnapCompost',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF24734E),
          brightness: Brightness.light,
        ),
      ),
      home: const MainShell(),
    );
  }
}

/// Shell navigasi bawah: Beranda · Tambah · Wadah.
class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: IndexedStack(
          index: _currentIndex,
          children: const [
            _PlaceholderScreen(title: 'Beranda'),
            _PlaceholderScreen(title: 'Tambah Sampah'),
            _PlaceholderScreen(title: 'Semua Wadah'),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (index) => setState(() => _currentIndex = index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Beranda',
          ),
          NavigationDestination(
            icon: Icon(Icons.add_circle_outline),
            selectedIcon: Icon(Icons.add_circle),
            label: 'Tambah',
          ),
          NavigationDestination(
            icon: Icon(Icons.inventory_2_outlined),
            selectedIcon: Icon(Icons.inventory_2),
            label: 'Wadah',
          ),
        ],
      ),
    );
  }
}

/// Placeholder sederhana untuk ketiga tab di Tahap A.
/// Akan diganti dengan screen asli di tahap berikutnya.
class _PlaceholderScreen extends StatelessWidget {
  const _PlaceholderScreen({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.compost_outlined,
            size: 64,
            color: theme.colorScheme.primary,
          ),
          const SizedBox(height: 16),
          Text(title, style: theme.textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text(
            'Placeholder — akan diisi di tahap berikutnya',
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
