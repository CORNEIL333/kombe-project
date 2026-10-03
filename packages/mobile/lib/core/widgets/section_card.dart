import 'package:flutter/material.dart';

import '../design/kombe_spacing.dart';

class SectionCard extends StatelessWidget {
  const SectionCard({
    required this.child,
    super.key,
    this.padding = const EdgeInsets.all(KombeSpacing.md),
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(padding: padding, child: child),
      );
}

class ScreenTitle extends StatelessWidget {
  const ScreenTitle({
    required this.title,
    super.key,
    this.subtitle,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(title, style: Theme.of(context).textTheme.headlineMedium),
              if (subtitle != null) ...<Widget>[
                const SizedBox(height: 6),
                Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium),
              ],
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}
