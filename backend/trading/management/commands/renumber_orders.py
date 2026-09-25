from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from trading.models import Order


class Command(BaseCommand):
    help = 'Renumber orders as YYYYMM-001, restarting the sequence each month.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Persist changes. Without this option, only show the proposed mapping.',
        )

    def handle(self, *args, **options):
        with transaction.atomic():
            orders = list(Order.objects.select_for_update().order_by('order_date', 'id'))
            sequences = defaultdict(int)
            mapping = []
            for order in orders:
                prefix = order.order_date.strftime('%Y%m')
                sequences[prefix] += 1
                if sequences[prefix] > 999:
                    raise ValueError(f'Month {prefix} contains more than 999 orders.')
                mapping.append((order, f'{prefix}-{sequences[prefix]:03d}'))

            for order, target in mapping:
                marker = 'unchanged' if order.number == target else f'{order.number or "(empty)"} -> {target}'
                self.stdout.write(f'order_id={order.pk}: {marker}')

            if not options['apply']:
                transaction.set_rollback(True)
                self.stdout.write(self.style.WARNING(f'Dry run only: {len(mapping)} order(s). Use --apply to save.'))
                return

            # Temporary unique values prevent collisions when existing numbers
            # are swapped or were assigned in a different order.
            for order, _ in mapping:
                Order.objects.filter(pk=order.pk).update(number=f'T{order.pk:09d}')
            for order, target in mapping:
                Order.objects.filter(pk=order.pk).update(number=target)
            self.stdout.write(self.style.SUCCESS(f'Renumbered {len(mapping)} order(s).'))
