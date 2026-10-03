import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';
import '../design/kombe_spacing.dart';
import 'african_pattern_band.dart';

class KombeScaffold extends StatelessWidget {
  const KombeScaffold({
    required this.body,
    super.key,
    this.title,
    this.actions,
    this.bottomNavigationBar,
    this.floatingActionButton,
    this.showPattern = false,
    this.safeArea = true,
  });

  final Widget body;
  final String? title;
  final List<Widget>? actions;
  final Widget? bottomNavigationBar;
  final Widget? floatingActionButton;
  final bool showPattern;
  final bool safeArea;

  @override
  Widget build(BuildContext context) {
    Widget content = body;
    if (safeArea) content = SafeArea(child: content);
    return Scaffold(
      backgroundColor: KombeColors.cream,
      appBar: title == null
          ? null
          : AppBar(
              title: Text(title!),
              actions: actions,
            ),
      body: Column(
        children: <Widget>[
          Expanded(child: content),
          if (showPattern) const AfricanPatternBand(),
        ],
      ),
      bottomNavigationBar: bottomNavigationBar,
      floatingActionButton: floatingActionButton,
    );
  }
}

class ScreenPadding extends StatelessWidget {
  const ScreenPadding({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: KombeSpacing.screen,
          vertical: KombeSpacing.md,
        ),
        child: child,
      );
}
