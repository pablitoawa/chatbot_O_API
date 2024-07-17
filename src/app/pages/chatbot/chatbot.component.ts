import { CommonModule } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, ViewChild, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';

interface Message {
  text: string;
  isUser: boolean;
  timestamp: string;
  role: 'user' | 'assistant' | 'system';
  isAudio?: boolean;
  audioUrl?: string;
  transcription?: string;
  showTranscription?: boolean;
  isImage?: boolean;
  imageUrl?: string;
}

@Component({
  selector: 'app-chatbot',
  templateUrl: './chatbot.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrls: ['./chatbot.component.css'],
})
export class ChatBotComponent implements AfterViewChecked {
  @ViewChild('chatMessages') private chatMessagesContainer!: ElementRef;

  messages: Message[] = [
    {
      text: 'Hola, ¿En qué puedo ayudarte?',
      isUser: false,
      timestamp: this.getCurrentTimestamp(),
      role: 'assistant',
    },
  ];
  newMessage = '';
  isDragging = false; 
  isRecording = false;
  isLoading = false;
  private shouldScrollToBottom = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private readonly apiKey = 'Inserte la API Key AQUI';
  private readonly apiUrl = 'https://api.openai.com/v1';

  botMessage: string = ''; // Hacer público

  constructor(private http: HttpClient, private ngZone: NgZone) {}

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
    }
  }

  scrollToBottom(): void {
    try {
      this.chatMessagesContainer.nativeElement.scrollTop =
        this.chatMessagesContainer.nativeElement.scrollHeight;
      this.shouldScrollToBottom = false;
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }

  addMessage(message: Message): void {
    this.messages.push(message);
    this.shouldScrollToBottom = true;
  }

  getCurrentTimestamp(): string {
    return new Date().toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  sendMessage() {
    if (this.newMessage.trim()) {
      const userMessage: Message = {
        text: this.newMessage,
        isUser: true,
        timestamp: this.getCurrentTimestamp(),
        role: 'user',
      };
      this.addMessage(userMessage);
      this.getAssistantResponse(this.newMessage);
      this.newMessage = '';
    }
  }

  getAssistantResponse(userMessage: string) {
    this.isLoading = true;
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    });

    const conversationHistory = this.messages.map(msg => ({
      role: msg.role,
      content: msg.text
    }));

    const body = {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'Eres un asistente virtual de ventas útil y amigable.' },
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ],
    };

    this.http.post<any>(`${this.apiUrl}/chat/completions`, body, { headers }).subscribe({
      next: (response) => {
        this.ngZone.run(() => {
          const botMessage = response.choices[0].message.content;
          this.typeBotMessage(botMessage);
          this.isLoading = false;
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Error getting assistant response:', error);
          const errorMessage: Message = {
            text: 'Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.',
            isUser: false,
            timestamp: this.getCurrentTimestamp(),
            role: 'assistant'
          };
          this.addMessage(errorMessage);
          this.isLoading = false;
        });
      }
    });
  }

  typeBotMessage(fullText: string) {
    let currentText = '';
    const typingSpeed = 50; // velocidad de escritura en milisegundos

    const intervalId = setInterval(() => {
      if (currentText.length < fullText.length) {
        currentText += fullText.charAt(currentText.length);
        this.botMessage = currentText;
        this.shouldScrollToBottom = true;
      } else {
        clearInterval(intervalId);
        const botMessage: Message = {
          text: fullText,
          isUser: false,
          timestamp: this.getCurrentTimestamp(),
          role: 'assistant'
        };
        this.botMessage = '';
        this.addMessage(botMessage);
      }
    }, typingSpeed);
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.uploadFile(file);
    }
  }

  uploadFile(file: File) {
    if (file.type.startsWith('image/')) {
      this.handleImageUpload(file);
    } else if (file.type.startsWith('audio/')) {
      this.handleAudioUpload(file);
    }
  }

  handleImageUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageMessage: Message = {
        text: 'Imagen subida',
        isUser: true,
        timestamp: this.getCurrentTimestamp(),
        isImage: true,
        imageUrl: e.target?.result as string,
        role: 'user',
      };
      this.addMessage(imageMessage);
    };
    reader.readAsDataURL(file);
  }

  handleAudioUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.ngZone.run(() => {
        const audioMessage: Message = {
          text: 'Audio subido',
          isUser: true,
          timestamp: this.getCurrentTimestamp(),
          isAudio: true,
          audioUrl: e.target?.result as string,
          role: 'user'
        };
        this.addMessage(audioMessage);
        this.transcribeAudio(file);
      });
    };
    reader.readAsDataURL(file);
  }

  startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.handleAudioUpload(
          new File([audioBlob], 'recorded_audio.webm', { type: 'audio/webm' })
        );
        this.audioChunks = [];
      };
      this.mediaRecorder.start();
      this.isRecording = true;
    });
  }

  stopRecording() {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
  }

  transcribeAudio(audioFile: File) {
    this.isLoading = true;
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('model', 'whisper-1');

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.apiKey}`
    });

    this.http.post<any>(`${this.apiUrl}/audio/transcriptions`, formData, { headers }).subscribe({
      next: (transcriptionResponse) => {
        this.ngZone.run(() => {
          const lastMessage = this.messages[this.messages.length - 1];
          if (lastMessage.isAudio) {
            lastMessage.transcription = transcriptionResponse.text;
            this.getAssistantResponse(transcriptionResponse.text);
          }
          this.isLoading = false;
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Error transcribing audio:', error);
          this.isLoading = false;
        });
      }
    });
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.uploadFile(files[0]);
    }
    this.isDragging = false;
  }
}
