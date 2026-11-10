
from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User

from .models import Drone, HangarItem, Order


# ==========================================
# REGISTRATION FORM
# ==========================================

class RegisterForm(UserCreationForm):
    email = forms.EmailField(
        required=True,
        label="Email"
    )

    class Meta:
        model = User
        fields = (
            "username",
            "email",
            "password1",
            "password2",
        )


# ==========================================
# DRONE FORM
# ==========================================

class DroneForm(forms.ModelForm):
    class Meta:
        model = Drone
        fields = (
            "category",
            "name",
            "manufacturer",
            "description",
            "image",
            "price",
            "flight_time",
            "range_km",
            "is_available",
        )

        widgets = {
            "description": forms.Textarea(
                attrs={"rows": 4}
            ),
        }


# ==========================================
# HANGAR ITEM FORM
# ==========================================

class HangarItemForm(forms.ModelForm):
    class Meta:
        model = HangarItem
        fields = ("status", "notes")

        labels = {
            "status": "Статус дрона",
            "notes": "Особисті нотатки",
        }

        widgets = {
            "status": forms.Select(
                attrs={"class": "form-select"}
            ),
            "notes": forms.Textarea(
                attrs={
                    "class": "form-control",
                    "rows": 5,
                    "placeholder": "Напиши свої нотатки про цей дрон...",
                }
            ),
        }


# ==========================================
# CHECKOUT FORM
# ==========================================

class CheckoutForm(forms.ModelForm):
    class Meta:
        model = Order

        fields = (
            "full_name",
            "email",
            "phone",
            "city",
            "address",
            "comment",
        )

        labels = {
            "full_name": "Ім'я та прізвище",
            "email": "Електронна пошта",
            "phone": "Номер телефону",
            "city": "Місто",
            "address": "Адреса доставки",
            "comment": "Коментар до замовлення",
        }

        widgets = {
            "full_name": forms.TextInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "Введіть ім'я та прізвище",
                    "autocomplete": "name",
                }
            ),

            "email": forms.EmailInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "example@email.com",
                    "autocomplete": "email",
                }
            ),

            "phone": forms.TextInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "+380 XX XXX XX XX",
                    "autocomplete": "tel",
                }
            ),

            "city": forms.TextInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "Вкажіть місто",
                    "autocomplete": "address-level2",
                }
            ),

            "address": forms.TextInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "Вулиця, будинок, квартира",
                    "autocomplete": "street-address",
                }
            ),

            "comment": forms.Textarea(
                attrs={
                    "class": "form-control",
                    "placeholder": "Додаткова інформація (необов'язково)",
                    "rows": 4,
                }
            ),
        }

    def clean_full_name(self):
        full_name = self.cleaned_data["full_name"].strip()

        if len(full_name) < 3:
            raise forms.ValidationError(
                "Вкажіть повне ім'я покупця."
            )

        return full_name

    def clean_phone(self):
        phone = self.cleaned_data["phone"].strip()

        allowed_characters = set(
            "0123456789+()- "
        )

        if not all(
            character in allowed_characters
            for character in phone
        ):
            raise forms.ValidationError(
                "Введіть коректний номер телефону."
            )

        digits = "".join(
            character
            for character in phone
            if character.isdigit()
        )

        if len(digits) < 9 or len(digits) > 15:
            raise forms.ValidationError(
                "Номер телефону повинен містити від 9 до 15 цифр."
            )

        return phone

    def clean_city(self):
        city = self.cleaned_data["city"].strip()

        if len(city) < 2:
            raise forms.ValidationError(
                "Вкажіть назву міста."
            )

        return city

    def clean_address(self):
        address = self.cleaned_data["address"].strip()

        if len(address) < 5:
            raise forms.ValidationError(
                "Вкажіть повну адресу доставки."
            )

        return address
