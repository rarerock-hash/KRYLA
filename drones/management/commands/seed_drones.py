
import re
import urllib.parse
import urllib.request
import json
from decimal import Decimal
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError

from drones.models import Category, Drone


DRONES = [
    {
        "name": "DJI Mini 4 Pro",
        "manufacturer": "DJI",
        "price": "799.00",
        "flight_time": 34,
        "range_km": 10,
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
        "description": (
            "Професійний дрон із потрійною системою камер, "
            "основною камерою Hasselblad та можливістю "
            "зйомки відео 5.1K."
        ),
    },
]


def normalize(value):
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def find_commons_photo(drone_name):
    """
    Search Wikimedia Commons for an exact model name.

    Only accept image titles containing the full model name.
    This avoids attaching a photograph of another drone.
    """

    api_url = "https://commons.wikimedia.org/w/api.php"

    params = {
        "action": "query",
        "generator": "search",
        "gsrsearch": f'filetype:bitmap "{drone_name}"',
        "gsrnamespace": 6,
        "gsrlimit": 20,
        "prop": "imageinfo",
        "iiprop": "url|mime|size",
        "iiurlwidth": 1200,
        "format": "json",
    }

    url = api_url + "?" + urllib.parse.urlencode(params)

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "KRYLA-Educational-Django-Project/1.0 "
                "(drone catalog image research)"
            )
        },
    )

    with urllib.request.urlopen(request, timeout=15) as response:
        data = json.load(response)

    pages = data.get("query", {}).get("pages", {})

    expected = normalize(drone_name)

    for page in pages.values():
        title = page.get("title", "")
        title_normalized = normalize(title)

        if expected not in title_normalized:
            continue

        image_info = page.get("imageinfo", [])

        if not image_info:
            continue

        info = image_info[0]
        mime = info.get("mime", "")

        if mime not in ("image/jpeg", "image/png", "image/webp"):
            continue

        image_url = info.get("thumburl") or info.get("url")

        if image_url:
            return image_url, mime

    return None, None


def download_photo(url):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "KRYLA-Educational-Django-Project/1.0 "
                "(drone catalog image download)"
            )
        },
    )

    with urllib.request.urlopen(request, timeout=20) as response:
        content_type = response.headers.get(
            "Content-Type", ""
        ).split(";")[0].strip()

        if not content_type.startswith("image/"):
            raise ValueError("URL did not return an image.")

        data = response.read(8 * 1024 * 1024 + 1)

        if len(data) > 8 * 1024 * 1024:
            raise ValueError("Image exceeds the size limit.")

        if not data:
            raise ValueError("Empty image.")

        return data


class Command(BaseCommand):
    help = "Populate the KRYLA drone catalog with 10 models."

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
                    "No users found. Create a user first."
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
        updated_count = 0
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
                updated_count += 1

                # Preserve existing drone information.
                # Only fill an empty photo below.
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

            if drone.image:
                self.stdout.write(
                    f"Photo already exists: {name}"
                )
                continue

            try:
                image_url, mime = find_commons_photo(name)

                if not image_url:
                    self.stdout.write(
                        self.style.WARNING(
                            f"No verified photo found: {name}"
                        )
                    )
                    continue

                image_bytes = download_photo(image_url)

                extension = {
                    "image/jpeg": ".jpg",
                    "image/png": ".png",
                    "image/webp": ".webp",
                }.get(mime, ".jpg")

                filename = (
                    normalize(name) + extension
                )

                drone.image.save(
                    filename,
                    ContentFile(image_bytes),
                    save=True,
                )

                photo_count += 1

                self.stdout.write(
                    self.style.SUCCESS(
                        f"Photo saved: {name}"
                    )
                )

            except Exception as error:
                self.stdout.write(
                    self.style.WARNING(
                        f"Photo unavailable for {name}: {error}"
                    )
                )

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
            f"Existing drones preserved: {updated_count}"
        )
        self.stdout.write(
            f"Photos downloaded: {photo_count}"
        )
        self.stdout.write(
            f"Total drone records: {Drone.objects.count()}"
        )
