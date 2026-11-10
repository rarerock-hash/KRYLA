
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError

from drones.models import Category, Drone


# Фотографії збережені в проєкті та не потребують інтернету.
# Назви файлів відповідають фотографіям, вибраним у Django Admin.

DRONES = [
    {
        "name": "DJI Mini 4 Pro",
        "manufacturer": "DJI",
        "price": "799.00",
        "flight_time": 34,
        "range_km": 10,
        "image": "djimini4pro.jpg",
        "description": (
            "Компактний дрон для аерозйомки з камерою 4K, "
            "всенаправленим виявленням перешкод та інтелектуальними "
            "режимами польоту."
        ),
    },
    {
        "name": "DJI Air 3S",
        "manufacturer": "DJI",
        "price": "1099.00",
        "flight_time": 45,
        "range_km": 10,
        "image": "djiair3s.jpg",
        "description": (
            "Потужний дрон із подвійною камерою, основним "
            "1-дюймовим сенсором та вдосконаленою системою "
            "виявлення перешкод."
        ),
    },
    {
        "name": "Autel EVO Lite+",
        "manufacturer": "Autel Robotics",
        "price": "1249.00",
        "flight_time": 40,
        "range_km": 12,
        "image": "7_550x.webp",
        "description": (
            "Складаний дрон із 1-дюймовим CMOS-сенсором, "
            "регульованою діафрагмою та можливістю зйомки "
            "відео високої роздільності."
        ),
    },
    {
        "name": "Parrot ANAFI Ai",
        "manufacturer": "Parrot",
        "price": "4500.00",
        "flight_time": 32,
        "range_km": None,
        "image": "уцауцацуа.jpeg",
        "description": (
            "Професійний дрон із підтримкою 4G, "
            "48-мегапіксельною камерою та можливостями "
            "автоматизованої аерозйомки."
        ),
    },
    {
        "name": "Skydio 2+",
        "manufacturer": "Skydio",
        "price": "1099.00",
        "flight_time": 27,
        "range_km": 6,
        "image": "кмкмк.webp",
        "description": (
            "Автономний дрон із комп'ютерним зором, "
            "інтелектуальним стеженням за об'єктами "
            "та системою уникнення перешкод."
        ),
    },
    {
        "name": "HOVERAir X1 ProMax",
        "manufacturer": "HOVERAir",
        "price": "699.00",
        "flight_time": 16,
        "range_km": 1,
        "image": "ккака.jpeg",
        "description": (
            "Компактна літаюча камера для персональної "
            "відеозйомки з автоматичними режимами "
            "стеження та записом відео до 8K."
        ),
    },
    {
        "name": "Potensic ATOM",
        "manufacturer": "Potensic",
        "price": "349.00",
        "flight_time": 32,
        "range_km": 6,
        "image": "23у23у.jpeg",
        "description": (
            "Легкий складаний дрон із камерою 4K, "
            "тривісним стабілізатором та GPS-навігацією. "
            "Підходить для подорожей і початківців."
        ),
    },
    {
        "name": "FIMI X8 Mini V2",
        "manufacturer": "FIMI",
        "price": "399.00",
        "flight_time": 31,
        "range_km": 9,
        "image": "1681083926_IMG_1970482.webp",
        "description": (
            "Портативний дрон для аерозйомки з камерою 4K, "
            "GPS-навігацією та інтелектуальними "
            "режимами польоту."
        ),
    },
    {
        "name": "DJI Avata 2",
        "manufacturer": "DJI",
        "price": "999.00",
        "flight_time": 23,
        "range_km": 10,
        "image": "images.jpeg",
        "description": (
            "FPV-дрон із захищеними пропелерами, "
            "ширококутною камерою 4K та підтримкою "
            "імерсивного керування."
        ),
    },
    {
        "name": "DJI Mavic 3 Pro",
        "manufacturer": "DJI",
        "price": "2199.00",
        "flight_time": 43,
        "range_km": 8,
        "image": "djimavic3pro.jpg",
        "description": (
            "Професійний дрон із потрійною системою камер, "
            "основною камерою Hasselblad та можливістю "
            "зйомки відео 5.1K."
        ),
    },
]


class Command(BaseCommand):
    help = "Populate the KRYLA drone catalog with 10 models and local photos."

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            type=str,
            help="Username that will own newly created drone records.",
        )

    def handle(self, *args, **options):
        User = get_user_model()

        username = options.get("username")

        if username:
            owner = User.objects.filter(
                username=username
            ).first()

            if owner is None:
                raise CommandError(
                    f"User '{username}' does not exist."
                )
        else:
            owner = User.objects.order_by("pk").first()

            if owner is None:
                raise CommandError(
                    "No users found. Create a user first using "
                    "'python manage.py createsuperuser'."
                )

        # Папка з фотографіями, які входять до GitHub-проєкту.
        images_dir = (
            Path(settings.BASE_DIR)
            / "drones"
            / "static"
            / "drones"
            / "images"
        )

        if not images_dir.is_dir():
            raise CommandError(
                f"Drone images directory not found: {images_dir}"
            )

        # Перевіряємо всі фотографії перед зміною бази даних.
        missing_images = [
            item["image"]
            for item in DRONES
            if not (images_dir / item["image"]).is_file()
        ]

        if missing_images:
            raise CommandError(
                "Missing drone images:\n"
                + "\n".join(missing_images)
            )

        category, _ = Category.objects.get_or_create(
            slug="civilian-drones",
            defaults={
                "name": "Civilian Drones",
                "description": (
                    "Цивільні дрони для аерозйомки, "
                    "подорожей та навчання."
                ),
            },
        )

        created_count = 0
        existing_count = 0
        photo_count = 0

        self.stdout.write(
            f"Using owner: {owner.username}"
        )

        for item in DRONES:
            name = item["name"]

            existing = Drone.objects.filter(
                name__iexact=name,
                manufacturer__iexact=item["manufacturer"],
            ).order_by("pk").first()

            if existing:
                drone = existing
                existing_count += 1

                # Не змінюємо існуючі характеристики.
                self.stdout.write(
                    f"Existing drone: {name}"
                )
            else:
                drone = Drone.objects.create(
                    owner=owner,
                    category=category,
                    name=name,
                    manufacturer=item["manufacturer"],
                    description=item["description"],
                    price=Decimal(item["price"]),
                    flight_time=item["flight_time"],
                    range_km=item["range_km"],
                    is_available=True,
                )

                created_count += 1

                self.stdout.write(
                    self.style.SUCCESS(
                        f"Created: {name}"
                    )
                )

            # Зберігаємо існуючі фотографії без змін,
            # якщо відповідний файл фізично існує.
            if drone.image:
                try:
                    if drone.image.storage.exists(drone.image.name):
                        self.stdout.write(
                            f"Photo already exists: {name}"
                        )
                        continue
                except (OSError, ValueError):
                    pass

            # Беремо фотографію з локальної папки проєкту.
            image_path = images_dir / item["image"]

            try:
                with image_path.open("rb") as image_file:
                    drone.image.save(
                        item["image"],
                        File(image_file),
                        save=True,
                    )

                photo_count += 1

                self.stdout.write(
                    self.style.SUCCESS(
                        f"Local photo saved: {name}"
                    )
                )

            except (OSError, ValueError) as error:
                raise CommandError(
                    f"Could not save photo for {name}: {error}"
                ) from error

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                "KRYLA catalog population completed."
            )
        )
        self.stdout.write(
            f"New drones: {created_count}"
        )
        self.stdout.write(
            f"Existing drones preserved: {existing_count}"
        )
        self.stdout.write(
            f"Local photos added: {photo_count}"
        )
        self.stdout.write(
            f"Total drone records: {Drone.objects.count()}"
        )
