const publicKey = document.getElementById("mercado-pago-public-key").value;
const mercadopago = new MercadoPago(publicKey);

function loadCardForm() {
    const productCost = document.getElementById('amount').value;
    const productDescription = document.getElementById('product-description').innerText;
    const payButton = document.getElementById("form-checkout__submit");
    const validationErrorMessages= document.getElementById('validation-error-messages');

    let currentBin;

    const fieldIdMapping = {
        "cardNumber": "form-checkout__cardNumber",
        "expirationDate": "form-checkout__cardExpirationDate",
        "securityCode": "form-checkout__securityCode"
    };

    function validityChangeHandler(field, errorMessages) {
        const input = document.getElementById(fieldIdMapping[field]);
        Array.from(validationErrorMessages.children).forEach(child => {
            const shouldRemoveChild = child.id.includes(field);
            if (shouldRemoveChild) {
                validationErrorMessages.removeChild(child);
            }
        });
        if (errorMessages.length > 0) {
            input.classList.add('validation-error');
            errorMessages.forEach((e, index) => {
                const p = document.createElement('p');
                p.id = `${field}-${index}`;
                p.innerText = e.message;
                validationErrorMessages.appendChild(p);
            });
        } else {
            input.classList.remove('validation-error');
        }

        if (validationErrorMessages.children.length > 0) {
            payButton.setAttribute('disabled', true);
        } else {
            payButton.removeAttribute('disabled');
        }
    }

    const cardNumberField = mercadopago.fields.create("cardNumber", {
        placeholder: "Card Number",
        style: {
            fontSize: "1rem"
        }
    }).mount("form-checkout__cardNumber")
    .on("validityChange", ({errorMessages}) => {
        validityChangeHandler("cardNumber", errorMessages);
    });

    const expirationDateField = mercadopago.fields.create("expirationDate", {
        placeholder: "MM/YY",
        style: {
            fontSize: "1rem"
        },
        mode: 'short'
    }).mount("form-checkout__cardExpirationDate")
    .on("validityChange", ({errorMessages}) => {
        validityChangeHandler("expirationDate", errorMessages);
    });

    const securityCodeField = mercadopago.fields.create("securityCode", {
        placeholder: "Security code",
        style: {
            fontSize: "1rem"
        }
    }).mount("form-checkout__securityCode")
    .on("validityChange", ({errorMessages}) => {
        validityChangeHandler("securityCode", errorMessages);
    });

    // Helper function to append option elements to a select input
    function createSelectOptions(elem, options, labelsAndKeys = { label : "name", value : "id"}){
        const {label, value} = labelsAndKeys;
    
        elem.options.length = 0;
    
        const tempOptions = document.createDocumentFragment();
    
        options.forEach( option => {
            const optValue = option[value];
            const optLabel = option[label];
    
            const opt = document.createElement('option');
            opt.value = optValue;
            opt.textContent = optLabel;

            if (!option.attributes) option.attributes = {};
            Object.keys(option.attributes).forEach(attribute => {
                opt.setAttribute(attribute, option.attributes[attribute]);
            })
    
            tempOptions.appendChild(opt);
        });
    
        elem.appendChild(tempOptions);
    }
    
    // Get Identification Types
    (async function getIdentificationTypes () {
        try {
            payButton.setAttribute("disabled", true);
            const identificationTypes = await mercadopago.getIdentificationTypes();
            payButton.removeAttribute("disabled");
            const identificationTypeElement = document.getElementById('form-checkout__identificationType');
    
            createSelectOptions(identificationTypeElement, identificationTypes)
        } catch(e) {
            return console.error('Error getting identificationTypes: ', e);
        }
    })()

    function clearHTMLSelectChildrenFrom(element) {
        const currOptions = [...element.children];
        currOptions.forEach(child => child.remove());
    }
    
    cardNumberField.on('binChange', async (data) => {
        const { bin } = data;
        try {
            const paymentMethodElement = document.getElementById('paymentMethodId');
            const issuerElement = document.getElementById('form-checkout__issuer');
            const installmentsElement = document.getElementById('form-checkout__installments');
    
            if (!bin && paymentMethodElement.value) {
                clearHTMLSelectChildrenFrom(issuerElement)
                createSelectOptions(issuerElement, [{ id: "", name: "Issuer" }])
                clearHTMLSelectChildrenFrom(installmentsElement)
                createSelectOptions(installmentsElement, [{ id: "", name: "Installments", attributes: { disabled: true, selected: true } }])
                paymentMethodElement.value = "";
                currentBin = bin;
                return
            }
        
            if (bin && bin !== currentBin) {
                payButton.setAttribute("disabled", true);
                const paymentMethods = await mercadopago.getPaymentMethods({ bin });
                payButton.removeAttribute("disabled");
                const { id: paymentMethodId, additional_info_needed, issuer, settings } = paymentMethods.results[0];
                // Assign payment method ID to a hidden input.
                paymentMethodElement.value = paymentMethodId;
                // If 'issuer_id' is needed, we fetch all issuers (getIssuers()) from bin.
                // Otherwise we just create an option with the unique issuer and call getInstallments().
                additional_info_needed.includes('issuer_id') ? getIssuers(bin) : (() => {
                    const issuerElement = document.getElementById('form-checkout__issuer');
                    createSelectOptions(issuerElement, [issuer]);
                    getInstallments(bin);
                })()

                const securityCodeSettings = settings[0].security_code;
                securityCodeField.update({
                    settings: securityCodeSettings
                });

                const cardNumberSettings = settings[0].security_code;
                cardNumberField.update({
                    settings: cardNumberSettings
                });
            }
            currentBin = bin;
        } catch (e) {
          console.error('error getting payment methods: ', e)
        }
    })

    async function getIssuers(bin) {
        try {
            const paymentMethodId = document.getElementById('paymentMethodId').value;
            const issuerElement = document.getElementById('form-checkout__issuer');
            payButton.setAttribute("disabled", true);
            const issuers = await mercadopago.getIssuers({ paymentMethodId, bin });
            payButton.removeAttribute("disabled");
            createSelectOptions(issuerElement, issuers);
            getInstallments(bin);
        } catch (e) {
            console.error('error getting issuers: ', e)
        }
    };

    async function getInstallments(bin) {
        try {
            const installmentsElement = document.getElementById('form-checkout__installments')
            payButton.setAttribute("disabled", true);
            const installments = await mercadopago.getInstallments({
                amount: productCost,
                bin,
                paymentTypeId: 'credit_card'
            });
            payButton.removeAttribute("disabled");
            createSelectOptions(installmentsElement, installments[0].payer_costs, { label: 'recommended_message', value: 'installments' })
        } catch (e) {
            console.error('error getting installments: ', e)
        }
    }

    const formElement = document.getElementById('form-checkout');
    formElement.addEventListener('submit', e => createCardToken(e));
    async function createCardToken(event) {
        try {
            const tokenElement = document.getElementById('token');
            if (!tokenElement.value) {
                event.preventDefault();
                const identificationType = document.getElementById('form-checkout__identificationType').value;
                const identificationNumber = document.getElementById('form-checkout__identificationNumber').value;
                const token = await mercadopago.fields.createCardToken({
                    cardholderName: document.getElementById('form-checkout__cardholderName').value,
                    identificationType,
                    identificationNumber,
                });
                tokenElement.value = token.id;

                const data = new FormData(formElement);
                
                fetch("/process_payment", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        token: token.id,
                        issuerId: data.get("issuer"),
                        paymentMethodId: data.get("paymentMethodId"),
                        transactionAmount: Number(productCost),
                        installments: Number(data.get("installments")),
                        description: productDescription,
                        payer: {
                            email: data.get("cardholderEmail"),
                            identification: {
                                type: identificationType,
                                number: identificationNumber,
                            },
                        },
                    }),
                })
                    .then(response => {
                        return response.json();
                    })
                    .then(result => {
                        if(!result.hasOwnProperty("error_message")) {
                            document.getElementById("success-response").style.display = "block";
                            document.getElementById("payment-id").innerText = result.id;
                            document.getElementById("payment-status").innerText = result.status;
                            document.getElementById("payment-detail").innerText = result.detail;
                        } else {
                            document.getElementById("error-message").textContent = result.error_message;
                            document.getElementById("fail-response").style.display = "block";
                        }

                        $('.container__payment').fadeOut(500);
                        setTimeout(() => { $('.container__result').show(500).fadeIn(); }, 500);
                    })
                    .catch(error => {
                        alert("Unexpected error\n"+JSON.stringify(error));
                    });
            }
        } catch (e) {
            console.error('error creating card token: ', e)
        }
    }
};

// Handle transitions
document.getElementById('checkout-btn').addEventListener('click', function(){
    $('.container__cart').fadeOut(500);
    setTimeout(() => {
        loadCardForm();
        $('.container__payment').show(500).fadeIn();
    }, 500);
});

document.getElementById('go-back').addEventListener('click', function(){
    $('.container__payment').fadeOut(500);
    setTimeout(() => { $('.container__cart').show(500).fadeIn(); }, 500);
});

// Handle price update
function updatePrice(){
    let quantity = document.getElementById('quantity').value;
    let unitPrice = document.getElementById('unit-price').innerText;
    let amount = parseInt(unitPrice) * parseInt(quantity);

    document.getElementById('cart-total').innerText = '$ ' + amount;
    document.getElementById('summary-price').innerText = '$ ' + unitPrice;
    document.getElementById('summary-quantity').innerText = quantity;
    document.getElementById('summary-total').innerText = '$ ' + amount;
    document.getElementById('amount').value = amount;
};

document.getElementById('quantity').addEventListener('change', updatePrice);
updatePrice();