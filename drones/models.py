
from django.conf import settings
from django.db import models
from django.core.validators import MinValueValidator


# ==========================================
# CATEGORY
# ==========================================

class Category(models.Model):
    name = models.CharField("Название", max_length=100, unique=True)
    slug = models.SlugField("URL категории", unique=True)
    description = models.TextField("Описание", blank=True)

    class Meta:
        verbose_name = "Категория"
        verbose_name_plural = "Категории"
        ordering = ["name"]

    def __str__(self):
        return self.name


# ==========================================
# DRONE
# ==========================================

class Drone(models.Model):
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="drones",
        verbose_name="Категория",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="drones",
        verbose_name="Владелец записи",
    )
    name = models.CharField("Название", max_length=150)
    manufacturer = models.CharField("Производитель", max_length=100)
    description = models.TextField("Описание")
    image = models.ImageField(
        "Фотография",
        upload_to="drones/",
        blank=True,
        null=True,
    )
    price = models.DecimalField(
        "Цена, EUR",
        max_digits=10,
        decimal_places=2,
    )
    flight_time = models.PositiveIntegerField(
        "Время полёта, мин",
        blank=True,
        null=True,
    )
    range_km = models.PositiveIntegerField(
        "Дальность, км",
        blank=True,
        null=True,
    )
    is_available = models.BooleanField(
        "В наличии",
        default=True,
    )
    created_at = models.DateTimeField(
        "Дата добавления",
        auto_now_add=True,
    )

    class Meta:
        verbose_name = "Дрон"
        verbose_name_plural = "Дроны"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


# ==========================================
# MY HANGAR
# ==========================================

class HangarItem(models.Model):
    STATUS_CHOICES = [
        ("saved", "Збережено"),
        ("training", "Для тренування"),
        ("favorite", "Улюблений"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hangar_items",
        verbose_name="Користувач",
    )
    drone = models.ForeignKey(
        Drone,
        on_delete=models.CASCADE,
        related_name="hangar_items",
        verbose_name="Дрон",
    )
    status = models.CharField(
        "Статус",
        max_length=20,
        choices=STATUS_CHOICES,
        default="saved",
    )
    notes = models.TextField(
        "Особисті нотатки",
        blank=True,
    )
    added_at = models.DateTimeField(
        "Дата додавання",
        auto_now_add=True,
    )

    class Meta:
        verbose_name = "Дрон в ангарі"
        verbose_name_plural = "Особисті ангари"
        ordering = ["-added_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "drone"],
                name="unique_drone_per_hangar",
            )
        ]

    def __str__(self):
        return f"{self.owner.username} — {self.drone.name}"


# ==========================================
# SHOPPING CART
# ==========================================

class CartItem(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cart_items",
        verbose_name="Покупець",
    )

    drone = models.ForeignKey(
        Drone,
        on_delete=models.CASCADE,
        related_name="cart_items",
        verbose_name="Дрон",
    )

    quantity = models.PositiveIntegerField(
        "Кількість",
        default=1,
        validators=[MinValueValidator(1)],
    )

    added_at = models.DateTimeField(
        "Дата додавання",
        auto_now_add=True,
    )

    class Meta:
        verbose_name = "Товар у кошику"
        verbose_name_plural = "Кошик покупок"
        ordering = ["-added_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "drone"],
                name="unique_drone_per_cart",
            )
        ]

    @property
    def total_price(self):
        return self.drone.price * self.quantity

    def __str__(self):
        return (
            f"{self.owner.username} — "
            f"{self.drone.name} x {self.quantity}"
        )


# ==========================================
# ORDER
# ==========================================

class Order(models.Model):
    STATUS_CHOICES = [
        ("new", "Нове"),
        ("processing", "В обробці"),
        ("shipped", "Відправлено"),
        ("completed", "Виконано"),
        ("cancelled", "Скасовано"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="orders",
        verbose_name="Покупець",
    )

    full_name = models.CharField(
        "Ім'я та прізвище",
        max_length=150,
    )

    email = models.EmailField(
        "Email",
    )

    phone = models.CharField(
        "Телефон",
        max_length=30,
    )

    city = models.CharField(
        "Місто",
        max_length=100,
    )

    address = models.CharField(
        "Адреса доставки",
        max_length=255,
    )

    comment = models.TextField(
        "Коментар до замовлення",
        blank=True,
    )

    status = models.CharField(
        "Статус замовлення",
        max_length=20,
        choices=STATUS_CHOICES,
        default="new",
    )

    total_amount = models.DecimalField(
        "Загальна сума, EUR",
        max_digits=12,
        decimal_places=2,
        default=0,
    )

    created_at = models.DateTimeField(
        "Дата оформлення",
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        "Дата оновлення",
        auto_now=True,
    )

    class Meta:
        verbose_name = "Замовлення"
        verbose_name_plural = "Замовлення"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Замовлення #{self.pk} — {self.full_name}"


# ==========================================
# ORDER ITEMS
# ==========================================

class OrderItem(models.Model):
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="Замовлення",
    )

    drone = models.ForeignKey(
        Drone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_items",
        verbose_name="Дрон",
    )

    drone_name = models.CharField(
        "Назва дрона",
        max_length=150,
    )

    manufacturer = models.CharField(
        "Виробник",
        max_length=100,
    )

    price = models.DecimalField(
        "Ціна за одиницю, EUR",
        max_digits=10,
        decimal_places=2,
    )

    quantity = models.PositiveIntegerField(
        "Кількість",
        default=1,
        validators=[MinValueValidator(1)],
    )

    class Meta:
        verbose_name = "Товар у замовленні"
        verbose_name_plural = "Товари замовлення"

    @property
    def total_price(self):
        return self.price * self.quantity

    def __str__(self):
        return (
            f"{self.drone_name} x {self.quantity} "
            f"(замовлення #{self.order_id})"
        )
